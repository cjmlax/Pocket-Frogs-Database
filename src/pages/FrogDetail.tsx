import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchFrogById } from '../api/teable';

export default function FrogDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: frog, isLoading, error } = useQuery({
    queryKey: ['frog', id],
    queryFn:  () => fetchFrogById(id!),
    enabled:  !!id,
  });

  if (isLoading) return <p>Loading…</p>;
  if (error)     return <p>Error loading frog. <Link to="/frogs">← Back to search</Link></p>;
  if (!frog)     return <p>Frog not found. <Link to="/frogs">← Back to search</Link></p>;

  return (
    <div>
      <p><Link to="/frogs">← Back to search</Link></p>
      <h1>{String(frog.fields.fullname ?? id)}</h1>
      <pre>{JSON.stringify(frog.fields, null, 2)}</pre>
    </div>
  );
}
