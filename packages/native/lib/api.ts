import { atom } from 'jotai';
import { newHttpBatchRpcSession, newWebSocketRpcSession } from 'capnweb';
import type { Api } from '../../server/src/rpc';
import { serverUrlAtom } from '../state/settings';

export type RpcApi = ReturnType<typeof newHttpBatchRpcSession<Api>>;

export const apiAtom = atom<RpcApi>((get) => {
  const serverUrl = get(serverUrlAtom);
  const rpcUrl = serverUrl.replace(/\/$/, '') + '/rpc';
  return newWebSocketRpcSession<Api>(rpcUrl);
});
