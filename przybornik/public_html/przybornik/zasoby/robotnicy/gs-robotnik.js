// Robotnik Ghostscripta (WebAssembly, AGPL). Jedno zadanie = nowa instancja programu,
// tak jak jedno uruchomienie gs w wierszu poleceń. Pliki żyją tylko w pamięci robotnika.
importScripts('../../lib/gs/gs.js');

let kolejka = Promise.resolve();
onmessage = (z) => { kolejka = kolejka.then(() => przerob(z.data)); };

async function przerob({ id, bajty, argumenty }) {
  try {
    const log = (linia) => postMessage({ id, typ: 'log', linia });
    const gs = await Module({
      noInitialRun: true,
      locateFile: (plik) => '../../lib/gs/' + plik,
      print: log,
      printErr: log,
    });
    gs.FS.writeFile('/wej.pdf', bajty);
    const kod = gs.callMain([...argumenty, '-sOutputFile=/wyj.pdf', '/wej.pdf']);
    let wynik;
    try { wynik = gs.FS.readFile('/wyj.pdf'); } catch { wynik = null; }
    if (!wynik || !wynik.length) throw new Error(`Ghostscript zakończył pracę z kodem ${kod} i nie zapisał pliku.`);
    postMessage({ id, typ: 'gotowe', bajty: wynik }, [wynik.buffer]);
  } catch (e) {
    postMessage({ id, typ: 'blad', komunikat: String((e && e.message) || e) });
  }
}
