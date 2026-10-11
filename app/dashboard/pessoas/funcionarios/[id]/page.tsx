import { FichaFuncionario } from "@/components/dashboard/pessoas/ficha"
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <FichaFuncionario id={id} /> }
