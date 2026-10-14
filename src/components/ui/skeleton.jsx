import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}) {
  return (
    (<div
      className={cn("animate-pulse rounded-token bg-fundo", className)}
      {...props} />)
  );
}

export { Skeleton }
