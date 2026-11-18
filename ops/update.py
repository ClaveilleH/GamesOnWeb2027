"""Installe la dernière archive publiée par le workflow de main."""

import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from zipfile import ZipFile


REPO = "ClaveilleH/GamesOnWeb2027"
TAG = re.compile(r"site-([0-9a-f]{40})")


def download(url):
    request = Request(url, headers={"User-Agent": "games-on-web-vps"})
    with urlopen(request, timeout=45) as response:
        return response.read()


def update(state):
    current = state / "current"
    try:
        release = json.loads(download(f"https://api.github.com/repos/{REPO}/releases/latest"))
    except HTTPError as error:
        if error.code == 404 and not current.is_symlink():
            print("En attente de la première release.")
            return
        raise
    tag = release["tag_name"]
    match = TAG.fullmatch(tag)
    if not match:
        raise ValueError(f"Tag inattendu : {tag}")
    previous = current.readlink() if current.is_symlink() else None
    if previous == Path(tag):
        return

    asset = next(asset for asset in release["assets"] if asset["name"] == "site.zip")
    data = download(asset["browser_download_url"])
    if asset["digest"] != "sha256:" + hashlib.sha256(data).hexdigest():
        raise ValueError("Somme SHA-256 incorrecte")

    with tempfile.TemporaryDirectory(dir=state) as temp:
        staging = Path(temp)
        files = staging / "site"
        with ZipFile(io.BytesIO(data)) as archive:
            archive.extractall(files)
        if (files / "version.txt").read_text().strip() != match[1] or not (files / "index.html").is_file():
            raise ValueError("Archive incomplète ou version incorrecte")
        if not (state / tag).exists():
            files.rename(state / tag)
        if previous:
            (staging / "previous").symlink_to(previous)
            (staging / "previous").replace(state / "previous")
        (staging / "current").symlink_to(tag)
        (staging / "current").replace(current)

    for path in state.iterdir():
        if TAG.fullmatch(path.name) and path.name != tag and Path(path.name) != previous:
            shutil.rmtree(path)
    print(f"Version en service : {tag}")


if __name__ == "__main__":
    update(Path(os.environ["STATE_DIRECTORY"]))
