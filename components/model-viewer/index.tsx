'use client'

import { Center, Environment, Html, OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Loader2 } from 'lucide-react'
import { Suspense } from 'react'

interface ModelViewerProps {
  modelUrl: string
}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  return <primitive object={scene} />
}

export function ModelViewer({ modelUrl }: ModelViewerProps) {
  return (
    <div className="h-full w-full bg-background">
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} />
        <Suspense fallback={
          <Html center>
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="size-8 animate-spin" />
              <span className="text-sm">加载模型中...</span>
            </div>
          </Html>
        }>
          <Center>
            <Model url={modelUrl} />
          </Center>
          <Environment preset="city" />
        </Suspense>
        <OrbitControls
          enablePan={false}
          minDistance={2}
          maxDistance={10}
        />
      </Canvas>
    </div>
  )
}
