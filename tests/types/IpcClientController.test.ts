import { expectType } from 'ts-expect'
import type { ClientFunctionReturnType, IpcClientControllerProxy } from '../../src/IpcClientController.ts'
import { createIpcClient } from '../../src/IpcClientController.ts'

expectType<ClientFunctionReturnType<() => number>>(Promise.resolve(1))
expectType<ClientFunctionReturnType<() => Promise<string>>>(Promise.resolve(''))
expectType<ClientFunctionReturnType<() => void>>(Promise.resolve())
// @ts-expect-error it should be Promise
expectType<ClientFunctionReturnType<() => number>>(1)

expectType<IpcClientControllerProxy<{ a: () => number }>>({
  $a: () => Promise.resolve(1),
})

expectType<IpcClientControllerProxy<{ a: () => number }>>({
  // @ts-expect-error probably not promise
  a: () => Promise.resolve(1),
})

const client = createIpcClient<{ a: (p: number) => number }, { b: (p: string) => void }, { c: (p: boolean) => void }>(
  'client',
)

expectType<Parameters<typeof client.invoke<'a'>>>(['a', 0])
// @ts-expect-error incorrect parameter type
expectType<Parameters<typeof client.invoke<'a'>>>(['a', '0'])
// @ts-expect-error incorrect generics
expectType<Parameters<typeof client.invoke<'b'>>>(['a', 0])
expectType<Parameters<typeof client.$a>>([0])
expectType<Parameters<typeof client.on<'b'>>>(['b', (_: Electron.IpcRendererEvent, __: string) => {}])
// @ts-expect-error incorrect parameter type
expectType<Parameters<typeof client.on<'b'>>>(['b', (_: Electron.IpcRendererEvent, __: boolean) => {}])
// @ts-expect-error incorrect generics
expectType<Parameters<typeof client.on<'c'>>>(['b', (_: Electron.IpcRendererEvent, __: string) => {}])
expectType<Parameters<typeof client.send<'c'>>>(['c', true])
// @ts-expect-error incorrect parameter type
expectType<Parameters<typeof client.send<'c'>>>(['c', 1])
// @ts-expect-error incorrect generics
expectType<Parameters<typeof client.send<'d'>>>(['c', true])
