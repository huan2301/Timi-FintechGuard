import { Component, type ErrorInfo, type ReactNode } from "react";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

/** Prevents an unexpected render error from leaving the mobile web page blank. */
export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Timi web render error", error, errorInfo);
  }

  private reloadPage = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f3ff] px-5 py-10">
        <section className="w-full max-w-sm rounded-3xl border border-violet-100 bg-white p-6 text-center shadow-xl shadow-violet-100/60">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-100 text-2xl">!</div>
          <h1 className="mt-5 text-lg font-bold text-slate-900">Timi cần tải lại trang</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Đã xảy ra lỗi hiển thị tạm thời. Tải lại trang để tiếp tục sử dụng.
          </p>
          <button
            type="button"
            onClick={this.reloadPage}
            className="mt-5 w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-violet-700"
          >
            Tải lại trang
          </button>
        </section>
      </main>
    );
  }
}
