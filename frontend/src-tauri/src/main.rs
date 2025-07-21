#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Command, Stdio};
use tauri::{Manager, WindowEvent};

fn kill_backend_processes() -> Result<(), std::io::Error> {
    Command::new("taskkill")
        .args(&["/IM", "outprioAPI.exe", "/F", "/T"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        // Add the opener plugin here
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Kill any existing backend processes before starting
            if let Err(e) = kill_backend_processes() {
                eprintln!("[OutPrio] Failed to kill existing backend processes: {}", e);
            } else {
                println!("[OutPrio] Existing backend processes terminated.");
            }

            // Launch the backend process
            match Command::new("bin/outprioAPI.exe")
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
            {
                Ok(_) => println!("[OutPrio] Backend launched successfully."),
                Err(e) => eprintln!("[OutPrio] Failed to launch backend: {}", e),
            }

            // Get the main window after it has been created by the builder
            if let Some(window) = app.get_webview_window("main") {
                // Ensure the window is not minimized and is in focus.
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }

            Ok(())
        })
        .on_window_event(|_app, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                // Kill all backend processes on window close
                if let Err(e) = kill_backend_processes() {
                    eprintln!("[OutPrio] Failed to kill backend processes: {}", e);
                } else {
                    println!("[OutPrio] Backend processes terminated.");
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("[OutPrio] Error while running Tauri app");
}
