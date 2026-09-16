import { shouldReconnectOnNetworkChange } from "./networkReconnectPolicy";
import { NetworkStateType } from "expo-network";

describe("shouldReconnectOnNetworkChange", () => {
  test("does not reconnect on the very first reading (nothing to compare against yet)", () => {
    expect(shouldReconnectOnNetworkChange(null, { type: NetworkStateType.WIFI, isConnected: true, isInternetReachable: true })).toBe(false);
  });

  test("reconnects when connectivity was lost and just came back", () => {
    const previous = { type: NetworkStateType.NONE, isConnected: false, isInternetReachable: false };
    const next = { type: NetworkStateType.WIFI, isConnected: true, isInternetReachable: true };
    expect(shouldReconnectOnNetworkChange(previous, next)).toBe(true);
  });

  test("does not reconnect when staying disconnected", () => {
    const previous = { type: NetworkStateType.NONE, isConnected: false, isInternetReachable: false };
    const next = { type: NetworkStateType.NONE, isConnected: false, isInternetReachable: false };
    expect(shouldReconnectOnNetworkChange(previous, next)).toBe(false);
  });

  test("does not reconnect when staying connected on the same network type", () => {
    const previous = { type: NetworkStateType.WIFI, isConnected: true, isInternetReachable: true };
    const next = { type: NetworkStateType.WIFI, isConnected: true, isInternetReachable: true };
    expect(shouldReconnectOnNetworkChange(previous, next)).toBe(false);
  });

  test("reconnects when the connection type changes (e.g. Wi-Fi to cellular) even if isConnected never reported false in between", () => {
    const previous = { type: NetworkStateType.WIFI, isConnected: true, isInternetReachable: true };
    const next = { type: NetworkStateType.CELLULAR, isConnected: true, isInternetReachable: true };
    expect(shouldReconnectOnNetworkChange(previous, next)).toBe(true);
  });

  test("does not reconnect on a type change while newly disconnected", () => {
    const previous = { type: NetworkStateType.WIFI, isConnected: true, isInternetReachable: true };
    const next = { type: NetworkStateType.NONE, isConnected: false, isInternetReachable: false };
    expect(shouldReconnectOnNetworkChange(previous, next)).toBe(false);
  });
});
