"""Convierte el Google Sheet (descargado como .xlsx) al formato que lee parse.py.
Uso:  python3 sync_from_sheet.py Brasao_October_2026_FULL_PROGRAM.xlsx
Luego: python3 parse.py sheet_export.txt && python3 build.py
Sheet: 1sGiV4ygGm-_SWq0u1WztXHv9gZ0rjj2JJyqMYwQMeWw (Brasao_October_2026_FULL_PROGRAM)"""
import sys, csv, io, openpyxl
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
def fmt(c):
    v = c.value
    if v is None: return ''
    nf = c.number_format or ''
    if isinstance(v, (int, float)):
        if '$' in nf: return '${:,.0f}'.format(v) if '.' not in nf else '${:,.2f}'.format(v)
        if '%' in nf: return '{:.1f}%'.format(v*100)
        return str(int(v)) if float(v).is_integer() else str(v)
    return str(v)
out = []
for ws in wb.worksheets:
    buf = io.StringIO(); w = csv.writer(buf)
    for row in ws.iter_rows(): w.writerow([fmt(c) for c in row])
    out.append('## Sheet name: ' + ws.title + '\n' + buf.getvalue())
open('sheet_export.txt', 'w', encoding='utf-8').write('\n'.join(out))
print('ok', len(out), 'tabs')
