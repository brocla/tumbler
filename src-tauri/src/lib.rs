use tauri::Manager;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_accent_color])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
