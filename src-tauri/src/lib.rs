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

#[cfg(target_os = "windows")]
#[tauri::command]
fn print_pdf(bytes: Vec<u8>) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::UI::Shell::{ShellExecuteExW, SHELLEXECUTEINFOW};
    use windows::core::w;

    // Write in-memory bytes to a fixed temp path.
    // Fixed name keeps cleanup trivial — next print overwrites it.
    let path = std::env::temp_dir().join("tumbler_print.pdf");
    std::fs::write(&path, &bytes)
        .map_err(|e| format!("Failed to write temp PDF: {e}"))?;

    // Encode path as null-terminated UTF-16. encode_wide() does not append a
    // null terminator, so we chain one. Vec must stay alive for the entire call.
    let path_wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut sei = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        lpVerb: w!("print"),   // compile-time wide literal, 'static lifetime
        lpFile: windows::core::PCWSTR::from_raw(path_wide.as_ptr()),
        nShow: 1i32,           // SW_SHOWNORMAL — no dialog, uses default printer
        ..Default::default()
    };

    // SAFETY: sei is properly initialised; path_wide is alive for this call;
    // w!("print") is 'static; ShellExecuteExW is safe to call from any thread.
    unsafe { ShellExecuteExW(&mut sei) }
        .map_err(|e| format!("ShellExecuteExW failed: {e}"))
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn print_pdf(_bytes: Vec<u8>) -> Result<(), String> {
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
        .invoke_handler(tauri::generate_handler![get_accent_color, get_initial_file, get_all_args, print_pdf])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
