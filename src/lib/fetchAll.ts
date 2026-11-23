/**
 * Supabase는 한 번에 최대 1,000건만 돌려줘요. 그보다 많을 수 있는 조회는 이걸로 나눠서 끝까지 받아와요.
 * make()는 매번 새 조회를 만들어야 하고, 순서가 흔들리지 않게 id까지 정렬해 두세요.
 */
interface Page<T> { data: T[] | null; error: { message: string } | null }
interface Rangeable<T> { range: (from: number, to: number) => PromiseLike<Page<T>> }

export const PAGE_SIZE = 1000;
const MAX_ROWS = 200_000; // 혹시 모를 무한 반복 방지

export async function fetchAll<T>(make: () => Rangeable<T>, pageSize = PAGE_SIZE): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += pageSize) {
    const { data, error } = await make().range(from, from + pageSize - 1);
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return { data: out, error: null };
}
