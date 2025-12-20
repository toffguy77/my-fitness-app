'use client'

interface SkeletonProps {
  className?: string
  width?: string
  height?: string
}

export default function Skeleton({ className = '', width, height }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-gray-200 rounded ${className}`}
      style={{ width, height }}
    />
  )
}

export function ProductCardSkeleton() {
  return (
    <div className="p-3 animate-pulse">
      <div className="flex items-start gap-3">
        <Skeleton className="w-16 h-16 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <div className="grid grid-cols-4 gap-2">
            <Skeleton className="h-3" />
            <Skeleton className="h-3" />
            <Skeleton className="h-3" />
            <Skeleton className="h-3" />
          </div>
          <Skeleton className="h-8 w-full mt-2" />
        </div>
      </div>
    </div>
  )
}

export function MessageSkeleton() {
  return (
    <div className="p-3 animate-pulse">
      <div className="flex gap-3">
        <Skeleton className="w-8 h-8 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-16 w-3/4 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

