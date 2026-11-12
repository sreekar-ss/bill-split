export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <h1 className="text-heading font-bold">TODO: groups/[id] {id}</h1>;
}
