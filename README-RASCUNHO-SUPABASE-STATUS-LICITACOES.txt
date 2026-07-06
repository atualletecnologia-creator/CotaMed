Correção Licitações

Alterações:
- Status saiu definitivamente da grade apertada e fica no topo do card.
- Badge do status usa largura automática e não corta.
- Rascunho da cotação passa a tentar salvar no Supabase.
- Se a tabela ainda não existir, mantém fallback no navegador.
- SQL incluído em supabase_sql/criar_licitacoes_rascunhos.sql.

Importante:
Execute o SQL no Supabase para ativar o rascunho persistente entre sessões/dispositivos.
