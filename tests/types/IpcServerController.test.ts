import { expectType } from 'ts-expect'
import type { TrustHandlerFunc } from '../../src/IpcServerController.ts'
import { createIpcServer } from '../../src/IpcServerController.ts'

const server = createIpcServer<{ a: (p: number) => number }, { b: (p: string) => void }, { c: (p: boolean) => void }>(
  'server',
)

expectType<Parameters<TrustHandlerFunc<ReturnType<typeof createIpcServer>>>[1]>('')
// @ts-expect-error incorrect generics
expectType<Parameters<TrustHandlerFunc<ReturnType<typeof createIpcServer>>>[1]>(['a', 'b', 'c'])
expectType<Parameters<TrustHandlerFunc<typeof server>>>([
  {} as typeof server,
  'a',
  'invoke',
  {} as Electron.IpcMainInvokeEvent,
])
expectType<Parameters<TrustHandlerFunc<typeof server>>>([
  {} as typeof server,
  // @ts-expect-error it should be a
  'c',
  'invoke',
  {} as Electron.IpcMainInvokeEvent,
])

expectType<Parameters<typeof server.handle<'a'>>>(['a', (a: number) => a])
expectType<Parameters<typeof server.handleWithEvent<'a'>>>(['a', (_: Electron.IpcMainInvokeEvent, a: number) => a])
// @ts-expect-error incorrect parameter type
expectType<Parameters<typeof server.handle<'a'>>>(['a', (_: string) => 1])
// @ts-expect-error incorrect generics
expectType<Parameters<typeof server.handle<'b'>>>(['a', (a: number) => a])
expectType<Parameters<typeof server.send<'b'>>>(['b', ''])
// @ts-expect-error incorrect parameter type
expectType<Parameters<typeof server.send<'b'>>>(['b', 1])
// @ts-expect-error incorrect generics
expectType<Parameters<typeof server.send<'c'>>>(['b', ''])
expectType<Parameters<typeof server.on<'c'>>>(['c', (_: Electron.IpcMainEvent, __: boolean) => {}])
// @ts-expect-error incorrect parameter type
expectType<Parameters<typeof server.on<'c'>>>(['c', (_: Electron.IpcMainEvent, __: string) => {}])
// @ts-expect-error incorrect generics
expectType<Parameters<typeof server.on<'d'>>>(['c', (_: Electron.IpcMainEvent, __: boolean) => {}])
