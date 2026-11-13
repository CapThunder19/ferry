"use client";

import { useConnect, useConnection, useConnectors, useDisconnect } from "wagmi";
import { short } from "@/lib/format";

export function ConnectButton({ large = false }: { large?: boolean }) {
  const { address, status } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();

  if (status === "connected" && address) {
    return (
      <button className="btn btn-ghost mono" onClick={() => disconnect.mutate()} title="Disconnect">
        <span className="dot" /> {short(address)}
      </button>
    );
  }
  const injected = connectors[0];
  return (
    <button
      className={`btn ${large ? "btn-lg" : ""}`}
      disabled={!injected || connect.isPending}
      onClick={() => injected && connect.mutate({ connector: injected })}
    >
      {connect.isPending ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
