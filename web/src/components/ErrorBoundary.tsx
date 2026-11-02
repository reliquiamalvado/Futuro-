import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

/** Se uma tela quebrar, mostra uma mensagem em vez de deixar o app em branco. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erro na tela:", error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <AlertTriangle className="mx-auto mb-3 size-10 text-amber-500" />
        <h1 className="text-lg font-semibold">Algo deu errado nesta tela</h1>
        <p className="mt-1 text-sm text-slate-500">Seus dados estão seguros. Tente recarregar a página.</p>
        <button onClick={() => window.location.reload()}
          className="mt-5 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600">
          Recarregar
        </button>
      </div>
    );
  }
}
