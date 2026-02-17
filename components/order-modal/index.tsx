'use client'

import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function OrderModal({
  open,
  onOpenChange,
  modelUrl: _modelUrl,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  modelUrl: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>下单打印</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <TriangleAlert className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            下单功能暂未开通，Shop 中台 API Key 尚未获取。
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            知道了
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
