import pythoncom
import win32com.client

pythoncom.CoInitialize()
try:
    ol = win32com.client.Dispatch("Outlook.Application")
    ns = ol.GetNamespace("MAPI")
    inbox = ns.GetDefaultFolder(6)
    print("Outlook folder name:", inbox.Name)
except Exception as e:
    print("COM Error:", e)
finally:
    pythoncom.CoUninitialize()
