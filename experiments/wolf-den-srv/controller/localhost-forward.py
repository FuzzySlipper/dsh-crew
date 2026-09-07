"""Pilot TCP forward inside the game container; localhost enables browser device APIs.

Forwards HTTP and WebSocket bytes unchanged. The container owns its lifetime.
"""
import argparse
import selectors
import socket
import socketserver


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, required=True)
    parser.add_argument('--host', required=True)
    parser.add_argument('--target-port', type=int, required=True)
    args = parser.parse_args()

    class Forward(socketserver.BaseRequestHandler):
        def handle(self):
            with socket.create_connection((args.host, args.target_port), timeout=10) as target:
                self.request.settimeout(10)
                target.settimeout(10)
                with selectors.DefaultSelector() as selector:
                    selector.register(self.request, selectors.EVENT_READ, target)
                    selector.register(target, selectors.EVENT_READ, self.request)
                    while True:
                        for key, _ in selector.select():
                            data = key.fileobj.recv(65536)
                            if not data:
                                return
                            key.data.sendall(data)

    class Server(socketserver.ThreadingTCPServer):
        allow_reuse_address = True
        daemon_threads = True

    with Server(('127.0.0.1', args.port), Forward) as server:
        server.serve_forever()


if __name__ == '__main__':
    main()
