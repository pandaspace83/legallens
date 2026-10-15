import type { CSSProperties } from 'react'
import { cn } from '@/lib/cn'

// Shimmer placeholder blocks for loading states (FE-1.2).
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div aria-hidden className={cn('animate-pulse rounded-md bg-hover', className)} style={style} />
  )
}
