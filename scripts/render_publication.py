#!/usr/bin/env python3
"""Render public pages from a CMS publication snapshot, without writing to disk."""
import json
import sys
from build_academia import render_outputs

def main():
    publication = json.load(sys.stdin)
    if not isinstance(publication, dict):
        raise ValueError("Invalid publication snapshot")
    outputs = render_outputs(publication)
    json.dump(outputs, sys.stdout, ensure_ascii=False)

if __name__ == "__main__":
    main()
