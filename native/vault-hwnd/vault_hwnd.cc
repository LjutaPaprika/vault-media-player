#include <napi.h>

#ifdef _WIN32
#include <windows.h>
#include <string>

static uint64_t ReadHwnd(const Napi::CallbackInfo& info, int idx) {
  bool lossless = true;
  return info[idx].As<Napi::BigInt>().Uint64Value(&lossless);
}

// SetWindowBehind(mpvHwnd: BigInt, mainHwnd: BigInt, x: Number, y: Number, w: Number, h: Number): boolean
//
// Positions mpv's free-floating window at the given screen coordinates and inserts it
// directly below the Electron main window in Z-order, so the transparent Electron window
// shows mpv's video through DWM compositing.
//
// Also removes mpv from the taskbar and prevents it from stealing focus.
Napi::Value SetWindowBehind(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 6 || !info[0].IsBigInt() || !info[1].IsBigInt()) {
    Napi::TypeError::New(env, "Expected (mpvHwnd: BigInt, mainHwnd: BigInt, x, y, w, h: Number)")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  HWND mpvHwnd  = reinterpret_cast<HWND>(static_cast<uintptr_t>(ReadHwnd(info, 0)));
  HWND mainHwnd = reinterpret_cast<HWND>(static_cast<uintptr_t>(ReadHwnd(info, 1)));

  if (!IsWindow(mpvHwnd) || !IsWindow(mainHwnd)) {
    return Napi::Boolean::New(env, false);
  }

  int x = info[2].As<Napi::Number>().Int32Value();
  int y = info[3].As<Napi::Number>().Int32Value();
  int w = info[4].As<Napi::Number>().Int32Value();
  int h = info[5].As<Napi::Number>().Int32Value();

  // Remove window decoration (caption/border) if still present — mpv --no-border
  // should handle this, but belt-and-suspenders.
  LONG style = GetWindowLongA(mpvHwnd, GWL_STYLE);
  style &= ~(WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU);
  SetWindowLongA(mpvHwnd, GWL_STYLE, style);

  // Make it a tool window (hides from taskbar/alt-tab) and prevent focus stealing.
  LONG exStyle = GetWindowLongA(mpvHwnd, GWL_EXSTYLE);
  exStyle |= WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE;
  exStyle &= ~WS_EX_APPWINDOW;
  SetWindowLongA(mpvHwnd, GWL_EXSTYLE, exStyle);

  // Position mpv at the specified screen coordinates, inserting it just below
  // the Electron main window in Z-order. Using mainHwnd as hWndInsertAfter places
  // mpvHwnd directly below mainHwnd — Electron (transparent) sits on top, mpv below.
  BOOL ok = SetWindowPos(
    mpvHwnd, mainHwnd,
    x, y, w, h,
    SWP_NOACTIVATE
  );

  // Force a redraw so the video area paints immediately.
  SetWindowPos(mainHwnd, NULL, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);

  return Napi::Boolean::New(env, ok != 0);
}

// GetChildWindowInfo(parentHwnd: BigInt): Array<{className: string, hwnd: string}>
// Debug helper — lists all direct child windows of the given HWND.
struct EnumData {
  HWND parent;
  std::vector<HWND> children;
};

static BOOL CALLBACK EnumDirectChildren(HWND hwnd, LPARAM lParam) {
  EnumData* data = reinterpret_cast<EnumData*>(lParam);
  if (GetParent(hwnd) == data->parent) data->children.push_back(hwnd);
  return TRUE;
}

Napi::Value GetChildWindowInfo(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsBigInt()) {
    Napi::TypeError::New(env, "Expected BigInt parentHwnd").ThrowAsJavaScriptException();
    return env.Null();
  }

  HWND parentHwnd = reinterpret_cast<HWND>(
    static_cast<uintptr_t>(ReadHwnd(info, 0))
  );

  EnumData data;
  data.parent = parentHwnd;
  EnumChildWindows(parentHwnd, EnumDirectChildren, reinterpret_cast<LPARAM>(&data));

  Napi::Array result = Napi::Array::New(env, data.children.size());
  for (size_t i = 0; i < data.children.size(); i++) {
    char className[256] = {0};
    GetClassNameA(data.children[i], className, sizeof(className));
    Napi::Object obj = Napi::Object::New(env);
    obj.Set("className", Napi::String::New(env, className));
    obj.Set("hwnd", Napi::String::New(env,
      std::to_string(reinterpret_cast<uintptr_t>(data.children[i]))));
    result[i] = obj;
  }

  return result;
}

#else

Napi::Value SetWindowBehind(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), false);
}

Napi::Value GetChildWindowInfo(const Napi::CallbackInfo& info) {
  return Napi::Array::New(info.Env(), 0);
}

#endif

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("setWindowBehind",   Napi::Function::New(env, SetWindowBehind));
  exports.Set("getChildWindowInfo", Napi::Function::New(env, GetChildWindowInfo));
  return exports;
}

NODE_API_MODULE(vault_hwnd, Init)
