import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Keyboard, Camera, AlertTriangle } from "lucide-react";
import { iniciarLeitura, cameraPossivel } from "@/lib/leitorCodigo";

/**
 * Modal de leitura de código: câmera quando dá, leitor USB sempre.
 *
 * POR QUE OS DOIS CAMINHOS NO MESMO LUGAR
 *
 * Leitor USB se comporta como teclado — digita o código e manda Enter. Câmera é
 * outra coisa inteiramente. Um botão para cada daria duas portas para a mesma
 * tarefa, e o operador teria de saber qual aparelho a fábrica comprou.
 *
 * Aqui é um botão só: o modal tenta a câmera e, ao mesmo tempo, mantém um campo
 * com foco pronto para receber a rajada do leitor USB. Se a câmera não existir,
 * for recusada ou falhar, o campo continua lá e o modal DIZ o que aconteceu —
 * em vez de ficar preto sem explicação.
 */
export default function ModalLeitor({ aberto, aoFechar, aoLer, titulo = "Ler código" }) {
  const video = useRef(null);
  const campoUsb = useRef(null);
  const parada = useRef(null);
  const [erro, setErro] = useState(null);
  const [motor, setMotor] = useState(null);
  const [digitado, setDigitado] = useState("");

  useEffect(() => {
    if (!aberto) return undefined;

    let cancelado = false;
    setErro(null);
    setMotor(null);
    setDigitado("");

    // O Radix monta o conteudo do dialogo por `Presence`, num portal, DEPOIS do
    // ciclo em que `aberto` virou true. Entao no instante deste efeito
    // `video.current` ainda e null, e chamar a leitura aqui morria com
    // "Cannot set properties of null (setting 'srcObject')".
    const comVideo = async () => {
      const limite = Date.now() + 3000;
      while (!video.current && Date.now() < limite && !cancelado) {
        await new Promise((r) => requestAnimationFrame(r));
      }
      return video.current;
    };

    if (cameraPossivel()) {
      (async () => {
        try {
          const no = await comVideo();
          if (cancelado || !no) return;
          const r = await iniciarLeitura({
            video: no,
            aoLer: (codigo) => {
              if (cancelado) return;
              aoLer(codigo);
              aoFechar();
            },
          });
          if (cancelado) r.parar();
          else { parada.current = r.parar; setMotor(r.motor); }
        } catch (e) {
          if (cancelado) return;
          // So mensagem NOSSA chega ao operador. Erro de programacao (um
          // TypeError, por exemplo) vira texto generico aqui e detalhe no
          // console: mostrar "Cannot set properties of null" para quem esta na
          // linha de producao nao ajuda ninguem.
          if (e?.name === 'ErroDeLeitura') setErro(e);
          else {
            console.error('Falha inesperada ao abrir o leitor de codigo:', e);
            setErro({
              motivo: 'falha',
              message: 'Não consegui abrir a câmera. Use o leitor de mão ou digite o código.',
            });
          }
        }
      })();
    } else {
      setErro({ motivo: 'inseguro', message: 'A câmera só funciona em conexão segura (https) ou em localhost. Use o leitor de mão.' });
    }

    // O campo do leitor USB recebe o foco de saida: com ele focado, a rajada do
    // leitor cai aqui mesmo com a camera ligada, e os dois caminhos funcionam
    // ao mesmo tempo sem o operador escolher nada.
    const t = setTimeout(() => campoUsb.current?.focus(), 150);

    return () => {
      cancelado = true;
      clearTimeout(t);
      // Desligar a camera ao fechar nao e detalhe: sem isso a luz fica acesa,
      // a bateria do tablet vai embora e quem esta na linha acha que esta
      // sendo filmado.
      if (parada.current) { parada.current(); parada.current = null; }
    };
  }, [aberto, aoLer, aoFechar]);

  const enviarDigitado = (e) => {
    e.preventDefault();
    const codigo = digitado.trim();
    if (!codigo) return;
    aoLer(codigo);
    aoFechar();
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            Aponte a câmera para o código, ou dispare o leitor de mão.
          </DialogDescription>
        </DialogHeader>

        {erro ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-painel bg-atencao-suave px-4 py-4"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-atencao" aria-hidden="true" />
            <p className="text-sm font-bold text-atencao">{erro.message}</p>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-painel bg-tinta">
            {/* `playsinline` impede o iOS de abrir o video em tela cheia. */}
            <video
              ref={video}
              muted
              playsInline
              aria-label="Imagem da câmera"
              className="aspect-[4/3] w-full object-cover"
            />
            {/* Mira: o operador precisa saber ONDE encostar o código.
                A cor preta com 35% dentro de uma sombra gigante é proposital e
                não vira token: é o truque que escurece TUDO fora do quadro da
                mira com um elemento só. Não é cor de interface — é máscara. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <div className="h-24 w-4/5 rounded-token border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,.35)]" />
            </div>
            {motor && (
              <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full
                               bg-black/50 px-3 py-1 text-xs font-bold text-white">
                <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                {motor === 'nativo' ? 'leitor do navegador' : 'leitor embarcado'}
              </span>
            )}
          </div>
        )}

        <form onSubmit={enviarDigitado} className="flex flex-col gap-2">
          <label htmlFor="codigo-usb" className="flex items-center gap-2 text-[13px] font-bold text-texto-fraco">
            <Keyboard className="h-4 w-4" aria-hidden="true" />
            Leitor de mão ou digitação
          </label>
          <div className="flex gap-2">
            <input
              ref={campoUsb}
              id="codigo-usb"
              value={digitado}
              onChange={(e) => setDigitado(e.target.value)}
              placeholder="Dispare o leitor ou digite o código"
              autoComplete="off"
              className="foco-fluxo codigo h-12 min-h-[48px] min-w-0 flex-1 rounded-token border-2 border-transparent
                         bg-fundo px-4 text-[15px] font-semibold text-tinta outline-none
                         placeholder:font-medium placeholder:text-texto-apagado"
            />
            <Button type="submit" size="lg" disabled={!digitado.trim()}>
              Usar
            </Button>
          </div>
        </form>

        <Button variant="outline" size="lg" onClick={aoFechar} className="w-full">
          Cancelar
        </Button>
      </DialogContent>
    </Dialog>
  );
}
