import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/api/ApiProvider'
import { queryKeys } from '@/api/queryKeys'

// Endpoint group A: sign in, MFA and the signed-in user.
export function useMe() {
  const api = useApi()
  return useQuery({ queryKey: queryKeys.me, queryFn: () => api.getMe(), staleTime: Infinity })
}

/** Saves the licensing states on the server and refreshes the signed-in user (INT-3.10). */
export function useUpdateLicensingStates() {
  const api = useApi()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (states: string[]) => api.updateLicensingStates(states),
    onSuccess: (user) => client.setQueryData(queryKeys.me, user),
  })
}

export function useSignIn() {
  const api = useApi()
  return useMutation({
    mutationFn: (v: { email: string; password: string }) => api.signIn(v.email, v.password),
  })
}

export function useVerifyMfa() {
  const api = useApi()
  return useMutation({ mutationFn: (code: string) => api.verifyMfa(code) })
}
