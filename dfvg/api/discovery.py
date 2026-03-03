import socket
import threading
import time
import json
import logging
from typing import Optional

logger = logging.getLogger("dfvg.api.discovery")

class DiscoveryService:
    """
    Simple SSDP-like UDP broadcast responder for local network discovery.
    Listens on UDP port 32000.
    Responds to "DFVG_DISCOVER" with server info JSON.
    """
    
    def __init__(self, port: int = 8000):
        self.api_port = port
        self.running = False
        self.thread: Optional[threading.Thread] = None
        self.sock: Optional[socket.socket] = None

    def start(self):
        if self.running:
            return
            
        self.running = True
        self.thread = threading.Thread(target=self._listen, daemon=True, name="dfvg-discovery")
        self.thread.start()
        logger.info("Discovery service started on UDP 32000")

    def stop(self):
        self.running = False
        if self.sock:
            try:
                self.sock.close()
            except:
                pass

    def _get_local_ip(self):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    def _listen(self):
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            # Bind to all interfaces on port 32000
            self.sock.bind(('', 32000))
            self.sock.settimeout(1.0)
            
            while self.running:
                try:
                    data, addr = self.sock.recvfrom(1024)
                    message = data.decode('utf-8').strip()
                    
                    if message == "DFVG_DISCOVER":
                        ip = self._get_local_ip()
                        response = json.dumps({
                            "type": "DFVG_ANNOUNCE",
                            "ip": ip,
                            "port": self.api_port,
                            "url": f"http://{ip}:{self.api_port}"
                        }).encode('utf-8')
                        
                        self.sock.sendto(response, addr)
                        logger.debug("Sent discovery response to %s", addr)
                        
                except socket.timeout:
                    continue
                except Exception as e:
                    logger.error("Discovery error: %s", e)
                    
        except Exception as e:
            logger.error("Failed to start discovery listener: %s", e)
        finally:
            if self.sock:
                self.sock.close()
