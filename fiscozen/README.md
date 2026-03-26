# Fiscozen Fixtures

Queste fixture sono locali e servono per QA e import mock.

- `tasse_future.json`: scadenze future stimate da Fiscozen.
- `tasse_pagate.json`: pagamenti effettivi Fiscozen, compresi F24 aggregati.
- `mattia_2025_summary.json`: riepilogo provvisorio 2025 dal bilancino PDF.
- `mattia_2024_summary.json`: riepilogo storico 2024 in regime ordinario.
- `mattia_f24_breakdown_2025.json`: breakdown semantico di un F24 composito, senza allocazione monetaria per linea.

Nota: i bundle F24 aggregati non possono essere splittati con precisione solo dal JSON pagato. Per una riconciliazione monetaria per linea serve il PDF F24 o una trascrizione manuale.
