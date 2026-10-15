import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/api/ApiProvider'
import { queryKeys } from '@/api/queryKeys'
import type { ID, MatterInput } from '@/api/types'

// Endpoint group B: matters.
export function useMatters() {
  const api = useApi()
  return useQuery({ queryKey: queryKeys.matters, queryFn: () => api.listMatters() })
}

export function useMatter(matterId: ID) {
  const api = useApi()
  return useQuery({ queryKey: queryKeys.matter(matterId), queryFn: () => api.getMatter(matterId) })
}

// Matter admin (FE-3.8, FE-3.9). Every change refreshes the list and the one matter.
function useRefresh() {
  const client = useQueryClient()
  return (matterId?: ID) => {
    void client.invalidateQueries({ queryKey: queryKeys.matters, exact: true })
    if (matterId) void client.invalidateQueries({ queryKey: queryKeys.matter(matterId) })
  }
}

export function useCreateMatter() {
  const api = useApi()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (input: MatterInput) => api.createMatter(input),
    onSuccess: () => refresh(),
  })
}

export function useUpdateMatter(matterId: ID) {
  const api = useApi()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (patch: Partial<MatterInput>) => api.updateMatter(matterId, patch),
    onSuccess: () => refresh(matterId),
  })
}

export function useCloseMatter(matterId: ID) {
  const api = useApi()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: () => api.closeMatter(matterId),
    onSuccess: () => refresh(matterId),
  })
}

export function useExportMatter(matterId: ID) {
  const api = useApi()
  return useMutation({ mutationFn: () => api.exportMatter(matterId) })
}

export function useDeleteMatter(matterId: ID) {
  const api = useApi()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (confirmName: string) => api.deleteMatter(matterId, confirmName),
    onSuccess: () => {
      client.removeQueries({ queryKey: queryKeys.matter(matterId) })
      void client.invalidateQueries({ queryKey: queryKeys.matters, exact: true })
    },
  })
}
