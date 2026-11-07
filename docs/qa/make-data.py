"""Membuat data uji untuk harness QA (jalankan di folder data/). Butuh: reportlab, python-docx, openpyxl, python-pptx, Pillow, LibreOffice (soffice), qpdf."""
import io, random, re, subprocess, datetime
from PIL import Image, ImageFilter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
import docx, openpyxl
from pptx import Presentation
from pptx.util import Inches

Image.new('RGB', (200, 120), (30, 120, 200)).save('img.png')
d = docx.Document(); d.add_heading('Laporan Keuangan Q3', 1)
p = d.add_paragraph('Ini adalah paragraf dengan '); p.add_run('teks tebal').bold = True; p.add_run(' dan miring').italic = True
d.add_heading('Daftar', 2)
for t in ('Butir satu', 'Butir dua'): d.add_paragraph(t, style='List Bullet')
for t in ('Nomor satu', 'Nomor dua'): d.add_paragraph(t, style='List Number')
t = d.add_table(rows=3, cols=3); t.style = 'Table Grid'
for i, row in enumerate([('Item', 'Qty', 'Harga'), ('Pensil', '10', '2.500'), ('Buku', '5', '12.000')]):
    for j, v in enumerate(row): t.cell(i, j).text = v
d.add_paragraph('Penutup dokumen. ' * 30); d.save('t.docx')
for pr in d.paragraphs:
    for r in pr.runs: r.text = r.text.replace('Keuangan', 'Anggaran').replace('Pensil', 'Penghapus')
d.paragraphs[-1].add_run(' Kalimat tambahan baru.'); d.save('t2.docx')
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Penjualan'
ws.append(['Tanggal', 'Produk', 'Jumlah', 'Harga', 'Diskon']); ws.append([datetime.date(2026, 10, 5), 'Kopi', 12, 15000.5, 0.1])
ws['D2'].number_format = '#,##0.00'; ws['E2'].number_format = '0%'; wb.create_sheet('Ringkasan').append(['Total', '19']); wb.save('t.xlsx')
open('t.html', 'w').write('<html><head><title>Uji</title></head><body><h1>Halo</h1><p>Teks <b>tebal</b></p><ul><li>Satu</li></ul><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table></body></html>')
pr = Presentation(); s = pr.slides.add_slide(pr.slide_layouts[0]); s.shapes.title.text = 'Judul Uji'; pr.save('t.pptx')
for f, out in (('t.docx', 'doc.pdf'), ('t2.docx', 'doc2.pdf'), ('t.xlsx', 'sheet.pdf')):
    subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', '.', f], check=True)
    import os; os.replace(f.rsplit('.', 1)[0] + '.pdf', out)
subprocess.run(['qpdf', '--encrypt', 'rahasia123', 'owner', '128', '--', 'doc.pdf', 'enc.pdf'], check=True)
raw = open('doc.pdf', 'rb').read()
open('trunc.pdf', 'wb').write(raw[:int(len(raw) * .75)]); open('badxref.pdf', 'wb').write(re.sub(rb'startxref\s+\d+', b'startxref\n99999', raw)); open('garbage.pdf', 'wb').write(b'\x00junk\n' * 20 + raw)
c = canvas.Canvas('form.pdf'); c.drawString(72, 760, 'Formulir'); f = c.acroForm
f.textfield(name='nama', x=130, y=705, width=250, height=22); f.checkbox(name='setuju', x=130, y=668, size=16); f.choice(name='kota', value='Semarang', options=['Semarang', 'Jakarta'], x=130, y=625, width=150, height=22); c.save()
c = canvas.Canvas('blank.pdf', pagesize=(595, 842)); c.drawString(100, 700, 'Halaman satu'); c.showPage(); c.showPage(); c.drawString(100, 700, 'Halaman tiga'); c.showPage(); c.circle(300, 400, 1, fill=1); c.showPage(); c.showPage(); c.save()
c = canvas.Canvas('eight.pdf', pagesize=(595, 842))
for i in range(1, 9): c.setFont('Helvetica-Bold', 120); c.drawString(230, 380, str(i)); c.showPage()
c.save()
def photo(w, h, seed):
    random.seed(seed); im = Image.effect_noise((w // 8, h // 8), 60).convert('RGB').resize((w, h), Image.BICUBIC)
    return Image.blend(im, Image.linear_gradient('L').resize((w, h)).convert('RGB'), .5).filter(ImageFilter.GaussianBlur(2))
c = canvas.Canvas('photos.pdf', pagesize=(595, 842))
for i in range(2):
    c.drawString(50, 800, f'Halaman foto {i + 1} - teks ini harus tetap bisa dicari'); b = io.BytesIO(); photo(3000, 2000, i).save(b, 'JPEG', quality=95); b.seek(0)
    c.drawImage(ImageReader(b), 50, 420, width=495, height=330); c.drawImage(ImageReader(photo(2000, 1400, i + 9)), 50, 50, width=495, height=346); c.showPage()
c.save(); print('data uji siap')
