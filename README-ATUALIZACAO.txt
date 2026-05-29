Atualização Registros ANVISA

Substitua:
app/registros-anvisa/page.tsx

Correções:
- Data de vencimento salva sempre em AAAA-MM-DD.
- Aceita letras no campo Registro ANVISA.
- Campo vencimento agora é texto com placeholder AAAA-MM-DD para evitar conversão automática do navegador.
- Também aceita DD/MM/AAAA ou DD-MM-AAAA e converte para AAAA-MM-DD.
