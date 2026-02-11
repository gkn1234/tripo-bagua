import { tripoClient } from '@/lib/tripo'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const task = await tripoClient.getTask(id)
    return Response.json(task)
  }
  catch (error) {
    return Response.json(
      { status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
