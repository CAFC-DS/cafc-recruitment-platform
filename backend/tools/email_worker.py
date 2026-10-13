"""Railway persistent worker: python tools/email_worker.py. Deploy one replica."""
import os
import sys
import time
import logging

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv

load_dotenv()
import main
from email_service import GraphEmailService
from email_lifecycle import process_one


def run():
    transport = GraphEmailService()
    while True:
        try:
            if not process_one(main, transport):
                time.sleep(5)
        except Exception:
            logging.exception("Email worker failed")
            time.sleep(10)


if __name__ == "__main__":
    run()
