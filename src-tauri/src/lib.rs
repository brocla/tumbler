use std::sync::Mutex;

struct InitialFile(Mutex<Option<String>>);

#[tauri::command]
fn get_initial_file(state: tauri::State<InitialFile>) -> Option<String> {
    state.0.lock().unwrap().clone()
}

#[cfg(target_os = "windows")]
fn read_windows_accent() -> Option<String> {
    use windows::UI::ViewManagement::{UIColorType, UISettings};
    let settings = UISettings::new().ok()?;
    let color = settings.GetColorValue(UIColorType::Accent).ok()?;
    Some(format!("#{:02x}{:02x}{:02x}", color.R, color.G, color.B))
}

#[tauri::command]
fn get_accent_color() -> String {
    #[cfg(target_os = "windows")]
    {
        read_windows_accent().unwrap_or_else(|| "#5b8af0".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        "#5b8af0".to_string()
    }
}

#[tauri::command]
fn get_all_args() -> Vec<String> {
    std::env::args().collect()
}

#[tauri::command]
fn get_temp_dir() -> String {
    std::env::temp_dir().to_string_lossy().into_owned()
}

// ── Print settings returned from the native dialog to the frontend ────────────
#[derive(serde::Serialize)]
struct PrintSettings {
    cancelled: bool,
    printer:   String,
    copies:    u32,
    all_pages: bool,
    from_page: u32,
    to_page:   u32,
}

// Runs on a dedicated STA thread — PrintDlgExW requires COM STA and runs its own
// modal message loop. Tauri's main thread and worker threads are MTA (set by WebView2),
// so we must spawn a fresh thread with explicit STA initialisation.
#[cfg(target_os = "windows")]
fn show_print_dialog_impl(page_count: u32, owner_hwnd: isize) -> Result<PrintSettings, String> {
    use windows::Win32::Foundation::GlobalFree;
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
    use windows::Win32::System::Memory::{GlobalLock, GlobalUnlock};
    use windows::Win32::UI::Controls::Dialogs::{
        PrintDlgExW, DEVNAMES, PRINTDLGEXW, PRINTPAGERANGE,
        PD_ALLPAGES, PD_NOSELECTION, PD_PAGENUMS, PD_RESULT_PRINT,
        PD_USEDEVMODECOPIESANDCOLLATE, START_PAGE_GENERAL,
    };

    // Initialise COM as STA on this thread.
    // S_OK (0) = success, S_FALSE (1) = already initialised — both are fine.
    let hr = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    if hr.is_err() {
        return Err(format!("CoInitializeEx failed: HRESULT 0x{:08x}", hr.0));
    }

    let result = (|| -> Result<PrintSettings, String> {
        let mut page_range = PRINTPAGERANGE { nFromPage: 1, nToPage: page_count };

        // Pass null hDevMode/hDevNames — let the dialog allocate and populate them.
        let mut pdx = PRINTDLGEXW {
            lStructSize:    std::mem::size_of::<PRINTDLGEXW>() as u32,
            hwndOwner:      windows::Win32::Foundation::HWND(owner_hwnd as *mut core::ffi::c_void),
            Flags:          PD_ALLPAGES | PD_NOSELECTION | PD_USEDEVMODECOPIESANDCOLLATE,
            nMinPage:       1,
            nMaxPage:       page_count,
            nCopies:        1,
            lpPageRanges:   &mut page_range,
            nMaxPageRanges: 1,
            nPageRanges:    0,
            nStartPage:     START_PAGE_GENERAL,
            ..Default::default()
        };

        let call_result = unsafe { PrintDlgExW(&mut pdx) };

        if let Err(e) = call_result {
            return Err(format!("PrintDlgExW failed: {e}"));
        }

        if pdx.dwResultAction != PD_RESULT_PRINT {
            // Free whatever the dialog allocated.
            if !pdx.hDevMode.is_invalid() { unsafe { let _ = GlobalFree(Some(pdx.hDevMode)); } }
            if !pdx.hDevNames.is_invalid() { unsafe { let _ = GlobalFree(Some(pdx.hDevNames)); } }
            return Ok(PrintSettings { cancelled: true, printer: String::new(), copies: 0,
                                       all_pages: true, from_page: 1, to_page: page_count });
        }

        // Extract printer name from DEVNAMES.
        let printer_name = if pdx.hDevNames.is_invalid() {
            String::new()
        } else {
            unsafe {
                let base = GlobalLock(pdx.hDevNames) as *const u16;
                let name = if base.is_null() {
                    String::new()
                } else {
                    let dn = &*(base as *const DEVNAMES);
                    let device_ptr = base.add(dn.wDeviceOffset as usize);
                    let mut len = 0usize;
                    while *device_ptr.add(len) != 0 { len += 1; }
                    String::from_utf16_lossy(std::slice::from_raw_parts(device_ptr, len))
                };
                GlobalUnlock(pdx.hDevNames).ok();
                name
            }
        };

        let copies    = pdx.nCopies.max(1);
        let all_pages = (pdx.Flags.0 & PD_PAGENUMS.0) == 0;
        let (from_page, to_page) = if all_pages {
            (1, page_count)
        } else {
            (page_range.nFromPage, page_range.nToPage)
        };

        if !pdx.hDevMode.is_invalid()  { unsafe { let _ = GlobalFree(Some(pdx.hDevMode)); } }
        if !pdx.hDevNames.is_invalid() { unsafe { let _ = GlobalFree(Some(pdx.hDevNames)); } }

        Ok(PrintSettings { cancelled: false, printer: printer_name, copies, all_pages, from_page, to_page })
    })();

    unsafe { CoUninitialize(); }
    result
}

// The command spawns a dedicated STA thread and blocks until the dialog completes.
#[tauri::command]
async fn show_print_dialog(window: tauri::WebviewWindow, page_count: u32) -> Result<PrintSettings, String> {
    #[cfg(target_os = "windows")]
    {
        let hwnd_raw = window.hwnd().map_err(|e| format!("hwnd() failed: {e}"))?.0 as isize;
        let (tx, rx) = std::sync::mpsc::channel::<Result<PrintSettings, String>>();
        std::thread::spawn(move || {
            tx.send(show_print_dialog_impl(page_count, hwnd_raw)).ok();
        });
        rx.recv().map_err(|e| format!("channel recv failed: {e}"))?
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = window;
        Err("Printing is only supported on Windows.".to_string())
    }
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn print_pdf_path(path: String, printer: String) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Graphics::Printing::{GetDefaultPrinterW, SetDefaultPrinterW};
    use windows::Win32::UI::Shell::{ShellExecuteExW, SHELLEXECUTEINFOW};
    use windows::core::{w, PCWSTR};

    // Read the current default printer so we can restore it after printing.
    let original_default = {
        let mut size: u32 = 0;
        let _ = unsafe { GetDefaultPrinterW(None, &mut size) };
        if size == 0 {
            String::new()
        } else {
            let mut buf = vec![0u16; size as usize];
            let ok = unsafe { GetDefaultPrinterW(Some(windows::core::PWSTR(buf.as_mut_ptr())), &mut size) };
            if ok.as_bool() {
                // Trim trailing null.
                let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
                String::from_utf16_lossy(&buf[..len])
            } else {
                String::new()
            }
        }
    };

    // Temporarily set the user's chosen printer as default.
    let printer_pcwstr = {
        let wide: Vec<u16> = std::ffi::OsStr::new(&printer)
            .encode_wide().chain(std::iter::once(0)).collect();
        // SetDefaultPrinterW copies the string, so the Vec can be temporary.
        let ok = unsafe { SetDefaultPrinterW(PCWSTR::from_raw(wide.as_ptr())) };
        if !ok.as_bool() {
            return Err(format!("SetDefaultPrinterW failed for '{printer}'"));
        }
    };
    let _ = printer_pcwstr;

    // Use the "print" verb — proven to work with any registered PDF handler
    // (Foxit, Edge, Adobe, etc.). It prints to the current default printer.
    let path_wide: Vec<u16> = std::path::Path::new(&path)
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut sei = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        lpVerb: w!("print"),
        lpFile: PCWSTR::from_raw(path_wide.as_ptr()),
        nShow:  0i32, // SW_HIDE
        ..Default::default()
    };

    let result = unsafe { ShellExecuteExW(&mut sei) }
        .map_err(|e| format!("ShellExecuteExW failed: {e}"));

    // Restore the original default printer. Ignore errors — the print job is already queued.
    if !original_default.is_empty() {
        let wide: Vec<u16> = std::ffi::OsStr::new(&original_default)
            .encode_wide().chain(std::iter::once(0)).collect();
        let _ = unsafe { SetDefaultPrinterW(PCWSTR::from_raw(wide.as_ptr())) };
    }

    result
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn print_pdf_path(_path: String, _printer: String) -> Result<(), String> {
    Err("Printing is only supported on Windows.".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();

    // TEMPORARY: write all args to a log file in %TEMP% for debugging file-association launch
    let log_path = std::env::temp_dir().join("tumbler_args.txt");
    let log_content = args.join("\n");
    let _ = std::fs::write(&log_path, log_content);

    let initial_file = args.get(1).cloned();

    tauri::Builder::default()
        .manage(InitialFile(Mutex::new(initial_file)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|_app| {
            #[cfg(debug_assertions)]
            {
                use tauri::Manager;
                let window = _app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_accent_color, get_initial_file, get_all_args,
            get_temp_dir, show_print_dialog, print_pdf_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
