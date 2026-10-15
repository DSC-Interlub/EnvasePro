import React, { useMemo, useRef, useState } from "react";
import { Search, ScanLine, Check, Package, ArrowRight, X } from "lucide-react";
import { EmptyState } from "@/components/fluxo";

/**
 * Busca de produto do padrão Envase: campo largo, "Ler código", cartão do
 * produto escolhido e "Usados há pouco".
 *
 * O QUE ERA
 *
 * Um `<Input>` de 40px chamado "Código do Produto" em que o operador tinha de
 * DIGITAR `IVP050211010` de cabeça — 11 caracteres, sem conferência — e, se
 * errasse um dígito, não aparecia nada e não havia mensagem dizendo por quê.
 * Buscar pelo nome do produto era impossível.
 *
 * O "LER CÓDIGO" NÃO É BOTÃO DE ENFEITE
 *
 * Leitor de código de barras USB se comporta como teclado: ele digita o código
 * no campo que está com foco e manda um Enter. Então focar o campo É a
 * implementação para o leitor USB, e é o que este botão faz hoje — por isso ele
 * já vem ligado, e não desabilitado "até a câmera chegar". A leitura pela
 * câmera entra depois e substitui só o `onClick`.
 *
 * "USADOS HÁ POUCO" vem do `localStorage` desta máquina, não do banco: é a
 * bancada que repete produto, e uma consulta a mais no banco a cada registro
 * não se paga.
 */

const CHAVE_RECENTES = "envase_produtos_recentes";
const MAX_RECENTES = 4;
const MAX_RESULTADOS = 6;

export function lerRecentes() {
  try {
    const cru = JSON.parse(localStorage.getItem(CHAVE_RECENTES) || "[]");
    return Array.isArray(cru) ? cru.filter((c) => typeof c === "string") : [];
  } catch {
    return [];
  }
}

export function guardarRecente(codigo) {
  if (!codigo) return;
  try {
    const lista = [codigo, ...lerRecentes().filter((c) => c !== codigo)].slice(0, MAX_RECENTES);
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify(lista));
  } catch {
    // Navegador em modo privado ou armazenamento cheio: o atalho é conveniência,
    // não pode derrubar o registro.
  }
}

export default function BuscaProduto({
  products = [],
  codigo,
  aoEscolher,
  produtoSelecionado,
  embalagem,
  erro,
}) {
  const [termo, setTermo] = useState("");
  const campo = useRef(null);

  const resultados = useMemo(() => {
    const t = termo.trim().toLowerCase();
    if (t.length < 2) return [];
    return products
      .filter(
        (p) =>
          p.codigo?.toLowerCase().includes(t) ||
          p.nome?.toLowerCase().includes(t)
      )
      .slice(0, MAX_RESULTADOS);
  }, [termo, products]);

  const recentes = useMemo(() => {
    const codigos = lerRecentes();
    return codigos
      .map((c) => products.find((p) => p.codigo === c))
      .filter(Boolean)
      .filter((p) => p.codigo !== codigo);
  }, [products, codigo]);

  const escolher = (produto) => {
    guardarRecente(produto.codigo);
    aoEscolher(produto.codigo);
    setTermo("");
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Busca -------------------------------------------------------------- */}
      <div
        className="foco-fluxo flex h-[60px] items-center gap-3 rounded-painel border-2
                   border-transparent bg-fundo pl-5 pr-2.5
                   transition-[border-color,box-shadow]"
      >
        <Search className="h-5 w-5 flex-none text-texto-fraco" aria-hidden="true" />
        <input
          ref={campo}
          id="codigo_produto"
          type="search"
          autoComplete="off"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => {
            // Leitor USB termina a leitura com Enter. Se o que ele digitou casa
            // com um codigo exato, escolhe sozinho — sem isso o operador teria
            // de tocar no resultado depois de ler.
            if (e.key !== "Enter") return;
            e.preventDefault();
            const exato = products.find(
              (p) => p.codigo?.toLowerCase() === termo.trim().toLowerCase()
            );
            if (exato) escolher(exato);
            else if (resultados.length === 1) escolher(resultados[0]);
          }}
          placeholder="Buscar por nome ou código"
          aria-label="Buscar produto por nome ou código"
          className="h-[52px] min-w-0 flex-1 border-0 bg-transparent text-[17px] font-semibold
                     text-tinta outline-none placeholder:font-medium placeholder:text-texto-apagado"
        />
        <button
          type="button"
          onClick={() => campo.current?.focus()}
          className="press foco-fluxo flex h-12 flex-none items-center gap-2 rounded-token bg-cartao
                     px-4 text-sm font-bold text-tinta shadow-cartao"
        >
          <ScanLine className="h-[18px] w-[18px]" aria-hidden="true" />
          Ler código
        </button>
      </div>

      {/* Resultados da busca ------------------------------------------------ */}
      {termo.trim().length >= 2 && (
        <div className="rounded-painel bg-fundo p-1.5">
          {resultados.length === 0 ? (
            <EmptyState
              icone={Search}
              titulo="Nenhum produto encontrado"
              legenda={`Nada casa com “${termo.trim()}”. Confira o código ou busque pelo nome.`}
              className="py-8"
            />
          ) : (
            <ul className="flex flex-col">
              {resultados.map((p) => (
                <li key={p.id || p.codigo}>
                  <button
                    type="button"
                    onClick={() => escolher(p)}
                    className="press foco-fluxo flex min-h-[56px] w-full items-center justify-between
                               gap-3 rounded-token px-3 text-left hover:bg-cartao"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-bold text-tinta">{p.nome}</span>
                      <span className="codigo block text-xs font-semibold text-texto-fraco">
                        {p.codigo}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 flex-none text-texto-apagado" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Produto escolhido -------------------------------------------------- */}
      {produtoSelecionado ? (
        <>
        <div className="flex items-center gap-4 rounded-painel border-2 border-marca bg-marca-suave p-4 sm:p-5">
          <span
            aria-hidden="true"
            className="flex h-16 w-16 flex-none items-center justify-center rounded-painel
                       bg-cartao text-marca shadow-marca"
          >
            <Package className="h-7 w-7" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="codigo text-[13px] font-semibold text-marca-forte">
              {produtoSelecionado.codigo}
            </p>
            {/* Quebra em duas linhas em vez de truncar: a barra lateral do app
                tem 264px (o prototipo desenhou com 80px), entao o cartao fica
                mais estreito e "SEED Graxa Teste Bio" virava "SEED Graxa T...".
                Nome de produto e justamente o que o operador precisa conferir. */}
            <p className="text-xl font-extrabold leading-tight tracking-[-0.02em] text-tinta
                          [display:-webkit-box] [-webkit-box-orient:vertical]
                          [-webkit-line-clamp:2] overflow-hidden sm:text-2xl">
              {produtoSelecionado.nome}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {produtoSelecionado.unidade_medida && (
                <span className="rounded-full bg-cartao px-3 py-1 text-[13px] font-bold text-tinta">
                  Unidade {produtoSelecionado.unidade_medida}
                </span>
              )}
              {produtoSelecionado.consistencia != null && produtoSelecionado.consistencia !== "" && (
                <span className="rounded-full bg-cartao px-3 py-1 text-[13px] font-bold text-tinta">
                  Consistência {produtoSelecionado.consistencia}
                </span>
              )}
              {embalagem && (
                <span className="rounded-full bg-cartao px-3 py-1 text-[13px] font-bold text-tinta">
                  {embalagem.descricao || embalagem.codigo}
                  {embalagem.conteudo ? ` · ${embalagem.conteudo}` : ""}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-none flex-col items-center gap-2">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-marca text-white"
            >
              <Check className="h-4 w-4" strokeWidth={3.2} />
            </span>
            <button
              type="button"
              onClick={() => aoEscolher("")}
              aria-label="Trocar produto"
              className="press foco-fluxo flex h-12 w-12 items-center justify-center rounded-full
                         text-texto-fraco hover:bg-cartao hover:text-erro"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Produto no cadastro, mas SEM embalagem para os 4 ultimos digitos.
            Era uma falha silenciosa: o autosave tentava gravar `codigo_embalagem`
            vazio, o Postgres recusava (23503) e so o console sabia. O operador
            preenchia o formulario inteiro e descobria no "Registrar envase",
            com a mensagem "Selecione uma embalagem" e nenhum lugar para
            selecionar. */}
        {!embalagem && (
          <p className="rounded-token bg-atencao-suave px-4 py-3 text-sm font-bold text-atencao">
            Nenhuma embalagem cadastrada para os 4 últimos dígitos
            (<span className="codigo">{produtoSelecionado.codigo?.slice(-4)}</span>).
            O registro não pode ser finalizado assim — peça ao PCP o cadastro da embalagem.
          </p>
        )}
        </>
      ) : (
        <>
          {erro && <p className="text-xs font-bold text-erro">{erro}</p>}
          {/* A embalagem vem dos 4 ultimos digitos do codigo do produto. Quando
              nao casa nenhuma, o Zod exige `codigo_embalagem` e o operador fica
              sem saida — por isso o aviso diz o que fazer, em vez de so falhar. */}
          {codigo && !produtoSelecionado && (
            <p className="rounded-token bg-atencao-suave px-4 py-3 text-sm font-bold text-atencao">
              O código <span className="codigo">{codigo}</span> não está no cadastro de produtos.
              Busque pelo nome acima ou peça o cadastro ao PCP.
            </p>
          )}
        </>
      )}

      {/* Sem produto e sem busca o cartao ficava um retangulo vazio de meia
          tela. Dizer o que fazer custa 3 linhas e ocupa o lugar do vazio. */}
      {!produtoSelecionado && termo.trim().length < 2 && recentes.length === 0 && (
        <p className="rounded-painel bg-fundo px-5 py-6 text-center text-sm font-semibold text-texto-fraco">
          Nenhum produto escolhido ainda.
          <br />
          Digite o nome ou o código acima, ou dispare o leitor.
        </p>
      )}

      {/* Usados há pouco ---------------------------------------------------- */}
      {recentes.length > 0 && (
        <div className="min-w-0">
          <p className="mb-1.5 text-[13px] font-bold text-texto-fraco">Usados há pouco</p>
          <ul className="flex flex-col">
            {recentes.map((p) => (
              <li key={p.codigo}>
                <button
                  type="button"
                  onClick={() => escolher(p)}
                  className="press foco-fluxo flex min-h-[56px] w-full items-center justify-between
                             gap-3 rounded-token px-3 text-left hover:bg-fundo"
                >
                  <span className="min-w-0 truncate text-base font-bold text-tinta">{p.nome}</span>
                  <span className="flex flex-none items-center gap-1.5 text-[13px] font-semibold text-texto-fraco">
                    Usar
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
