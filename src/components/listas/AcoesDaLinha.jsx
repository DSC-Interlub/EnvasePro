import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Edit, Trash2, Eye } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Editar e excluir de uma linha de lista.
 *
 * DUAS DECISÕES, as duas por causa do dedo no tablet:
 *
 *  - os dois botões têm 48px e ficam SEPARADOS por um espaço maior que um
 *    deles. Antes eram dois ícones de 40px colados, com o excluir imediatamente
 *    ao lado do editar: errar o alvo apagava um cadastro;
 *  - a confirmação é um diálogo da aplicação, não o `confirm()` do navegador.
 *    O `confirm()` nativo aparece no topo da janela, longe de onde o dedo está,
 *    e no tablet pode ser suprimido pelo navegador. O diálogo também diz O QUE
 *    será excluído, em vez de "tem certeza?".
 */
export default function AcoesDaLinha({
  nomeDoItem, descricao, onEditar, onExcluir, onVer, extras = null, excluindo = false,
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
        {extras}
        {onVer && (
          <Button
            variant="outline"
            onClick={onVer}
            aria-label={`Ver detalhes de ${nomeDoItem}`}
            className="h-12 min-w-[48px] px-3"
          >
            <Eye className="w-5 h-5" />
            <span className="ml-2 hidden sm:inline">Ver</span>
          </Button>
        )}
        <Button
          variant="outline"
          onClick={onEditar}
          aria-label={`Editar ${nomeDoItem}`}
          className="h-12 min-w-[48px] px-3"
        >
          <Edit className="w-5 h-5" />
          <span className="ml-2 hidden sm:inline">Editar</span>
        </Button>
        <Button
          variant="outline"
          onClick={() => setAberto(true)}
          disabled={excluindo}
          aria-label={`Excluir ${nomeDoItem}`}
          /* ml-6: o afastamento do excluir em relação ao editar é a trava
             contra o toque errado, por isso vive aqui e não no gap do grupo. */
          className="h-12 min-w-[48px] px-3 ml-6 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <Trash2 className="w-5 h-5" />
          <span className="ml-2 hidden sm:inline">Excluir</span>
        </Button>
      </div>

      <AlertDialog open={aberto} onOpenChange={setAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {nomeDoItem}?</AlertDialogTitle>
            <AlertDialogDescription>
              {descricao || "Esta ação não pode ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-12">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="h-12 bg-red-600 hover:bg-red-700"
              onClick={() => { setAberto(false); onExcluir(); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
