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

#[cfg(target_os = "windows")]
#[tauri::command]
fn print_pdf_path(path: String) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::UI::Shell::{ShellExecuteExW, SHELLEXECUTEINFOW};
    use windows::core::w;

    let path_obj = std::path::Path::new(&path);

    // Encode path as null-terminated UTF-16.
    // encode_wide() does not append a null terminator, so we chain one.
    // Vec must stay alive for the entire ShellExecuteExW call.
    let path_wide: Vec<u16> = path_obj
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut sei = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        lpVerb: w!("print"),   // compile-time wide literal, 'static lifetime
        lpFile: windows::core::PCWSTR::from_raw(path_wide.as_ptr()),
        nShow: 1i32,           // SW_SHOWNORMAL — sends to default printer, no dialog
        ..Default::default()
    };

    // SAFETY: sei is properly initialised; path_wide is alive for this call;
    // w!("print") is 'static; ShellExecuteExW is safe to call from any thread.
    unsafe { ShellExecuteExW(&mut sei) }
        .map_err(|e| format!("ShellExecuteExW failed: {e}"))
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn print_pdf_path(_path: String) -> Result<(), String> {
    Err("Printing is only supported on Windows.".to_string())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn enumerate_printers() -> Result<Vec<String>, String> {
    use windows::Win32::Graphics::Printing::{
        EnumPrintersW, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_2W,
    };

    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let mut bytes_needed: u32 = 0;
    let mut count: u32 = 0;

    // First call: get required buffer size. ERROR_INSUFFICIENT_BUFFER is expected.
    unsafe {
        let _ = EnumPrintersW(
            flags,
            windows::core::PCWSTR::null(),
            2,
            None,
            &mut bytes_needed,
            &mut count,
        );
    }

    if bytes_needed == 0 {
        return Ok(vec![]);
    }

    let mut buf = vec![0u8; bytes_needed as usize];

    // Second call: fill the buffer.
    unsafe {
        EnumPrintersW(
            flags,
            windows::core::PCWSTR::null(),
            2,
            Some(buf.as_mut_slice()),
            &mut bytes_needed,
            &mut count,
        )
        .map_err(|e| format!("EnumPrintersW failed: {e}"))?;
    }

    let infos = unsafe {
        std::slice::from_raw_parts(buf.as_ptr() as *const PRINTER_INFO_2W, count as usize)
    };

    let names = infos
        .iter()
        .filter(|info| !info.pPrinterName.is_null())
        .map(|info| unsafe { info.pPrinterName.to_string() }.unwrap_or_default())
        .collect();

    Ok(names)
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn enumerate_printers() -> Result<Vec<String>, String> {
    Err("Printer enumeration is only supported on Windows.".to_string())
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn print_pdf_with_settings(
    path: String,
    printer: String,
    duplex: u8,    // 0 = simplex, 1 = long-edge (DMDUP_VERTICAL), 2 = short-edge (DMDUP_HORIZONTAL)
    landscape: bool,
) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Graphics::Gdi::{
        DEVMODEW, DM_DUPLEX, DM_IN_BUFFER, DM_ORIENTATION, DM_OUT_BUFFER,
        DMDUP_HORIZONTAL, DMDUP_SIMPLEX, DMDUP_VERTICAL,
    };
    use windows::Win32::Graphics::Printing::{ClosePrinter, DocumentPropertiesW, OpenPrinterW};
    use windows::Win32::UI::Shell::{ShellExecuteExW, SHELLEXECUTEINFOW};
    use windows::core::{w, PCWSTR};

    // Encode printer name as null-terminated UTF-16.
    let printer_wide: Vec<u16> = std::ffi::OsStr::new(&printer)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let printer_pcwstr = PCWSTR::from_raw(printer_wide.as_ptr());

    // Open a handle to the printer.
    let mut hprinter = windows::Win32::Graphics::Printing::PRINTER_HANDLE::default();
    unsafe {
        OpenPrinterW(printer_pcwstr, &mut hprinter, None)
            .map_err(|e| format!("OpenPrinterW failed: {e}"))?;
    }

    let result = (|| -> Result<(), String> {
        // Query the DEVMODE buffer size.
        let dm_size = unsafe {
            DocumentPropertiesW(None, hprinter, printer_pcwstr, None, None, 0u32)
        };
        if dm_size <= 0 {
            return Err(format!("DocumentPropertiesW size query returned {dm_size}"));
        }
        let dm_size = dm_size as usize;

        let mut original_buf = vec![0u8; dm_size];
        let mut modified_buf = vec![0u8; dm_size];

        // GET current DEVMODE into original_buf.
        let hr = unsafe {
            DocumentPropertiesW(
                None,
                hprinter,
                printer_pcwstr,
                Some(original_buf.as_mut_ptr() as *mut DEVMODEW),
                None,
                DM_OUT_BUFFER.0,
            )
        };
        if hr < 0 {
            return Err(format!("DocumentPropertiesW GET failed: {hr}"));
        }

        // Copy to modified buffer and patch fields.
        modified_buf.copy_from_slice(&original_buf);
        let dm = unsafe { &mut *(modified_buf.as_mut_ptr() as *mut DEVMODEW) };

        // dmOrientation lives inside Anonymous1 (DEVMODEW_0) → Anonymous1 (DEVMODEW_0_0).
        // dmCopies is handled via copies param — we send one job; copies set to 1.
        // dmDuplex is a top-level field on DEVMODEW.
        unsafe {
            dm.Anonymous1.Anonymous1.dmOrientation = if landscape { 2 } else { 1 }; // DMORIENT_LANDSCAPE=2, DMORIENT_PORTRAIT=1
        }
        dm.dmDuplex = match duplex {
            1 => DMDUP_VERTICAL,    // long-edge
            2 => DMDUP_HORIZONTAL,  // short-edge
            _ => DMDUP_SIMPLEX,
        };
        dm.dmFields.0 |= DM_ORIENTATION.0 | DM_DUPLEX.0;

        // SET the modified DEVMODE as the temporary per-user default.
        // KNOWN TRADE-OFF: temporarily mutates printer defaults; restored immediately after.
        let hr = unsafe {
            DocumentPropertiesW(
                None,
                hprinter,
                printer_pcwstr,
                None,
                Some(modified_buf.as_ptr() as *const DEVMODEW as *mut DEVMODEW),
                DM_IN_BUFFER.0,
            )
        };
        if hr < 0 {
            return Err(format!("DocumentPropertiesW SET failed: {hr}"));
        }

        // Encode file path as null-terminated UTF-16.
        let path_wide: Vec<u16> = std::path::Path::new(&path)
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        // ShellExecuteExW "printto" hands the PDF to the Windows PDF Print Handler,
        // which converts to XPS and sends vector content to the spooler at native
        // printer resolution — no rasterization in the app.
        let mut sei = SHELLEXECUTEINFOW {
            cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
            lpVerb: w!("printto"),
            lpFile: PCWSTR::from_raw(path_wide.as_ptr()),
            lpParameters: printer_pcwstr,
            nShow: 0i32, // SW_HIDE
            ..Default::default()
        };

        unsafe { ShellExecuteExW(&mut sei) }
            .map_err(|e| format!("ShellExecuteExW failed: {e}"))?;

        // Restore original DEVMODE. Intentionally ignore error — job already spooled.
        let _ = unsafe {
            DocumentPropertiesW(
                None,
                hprinter,
                printer_pcwstr,
                None,
                Some(original_buf.as_ptr() as *const DEVMODEW as *mut DEVMODEW),
                DM_IN_BUFFER.0,
            )
        };

        Ok(())
    })();

    unsafe { let _ = ClosePrinter(hprinter); }
    result
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn print_pdf_with_settings(
    _path: String, _printer: String, _duplex: u8, _landscape: bool,
) -> Result<(), String> {
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
    get_accent_color, get_initial_file, get_all_args, get_temp_dir,
    print_pdf_path, enumerate_printers, print_pdf_with_settings,
])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
