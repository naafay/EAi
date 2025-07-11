#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use tauri::{Builder, generate_context, Manager};

fn main() {
  Builder::default()
    .setup(|app| {
      if let Some(window) = app.get_window("main") {
        // Wait for DOM ready before setting zoom
        window.eval(
          r#"
          window.addEventListener('DOMContentLoaded', () => {
            document.body.style.zoom = '90%';
          });
          "#,
        )?;
      }
      Ok(())
    })
    .run(generate_context!())
    .expect("error while running tauri application");
}
