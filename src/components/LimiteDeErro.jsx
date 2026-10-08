import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Limite de erro: segura uma falha de render para que ela não apague a tela.
 *
 * POR QUE EXISTE
 *
 * Sem isto, qualquer exceção durante o render desmonta a árvore inteira do
 * React e o usuário fica com uma **página em branco**, sem explicação e sem
 * saída. Já aconteceu de verdade aqui: uma data nula na tela de check-out
 * fazia o date-fns lançar e a tela toda sumia.
 *
 * Com as páginas carregadas sob demanda (`lazy`), passa a existir um segundo
 * motivo: se o pedaço de JavaScript daquela rota não baixar — rede caindo na
 * fábrica, deploy novo trocando os arquivos com a aba aberta —, o carregamento
 * falha. Aqui isso vira uma mensagem com botão de tentar de novo.
 *
 * NÃO engole o erro: continua registrando no console, com o nome do
 * componente, para quem for investigar.
 */
export default class LimiteDeErro extends React.Component {
  constructor(props) {
    super(props);
    this.state = { erro: null };
  }

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro, info) {
    // Mantém o registro técnico, sem jogar o objeto inteiro (que costuma
    // trazer dados do usuário junto).
    console.error("[EnvasePro] falha ao desenhar a tela", {
      mensagem: String(erro?.message || erro).slice(0, 200),
      componente: String(info?.componentStack || "").split("\n")[1]?.trim(),
    });
  }

  render() {
    if (!this.state.erro) return this.props.children;

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 mx-auto flex items-center justify-center">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">
            Não foi possível abrir esta tela
          </h2>
          <p className="text-slate-600">
            Pode ter sido uma falha de conexão. Tente de novo; se continuar,
            avise o suporte.
          </p>
          <Button
            onClick={() => window.location.reload()}
            className="min-h-[48px] px-6"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Tentar de novo
          </Button>
        </div>
      </div>
    );
  }
}

/** Indicador de carregamento usado enquanto o pedaço da rota baixa. */
export function CarregandoTela() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div
        className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"
        role="status"
        aria-label="Carregando a tela"
      ></div>
    </div>
  );
}
