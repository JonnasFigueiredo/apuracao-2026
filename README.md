# VOTO/2026

👉 **[Abrir painel ao vivo](https://jonnasfigueiredo.github.io/apuracao-2026/)**

Painel web para acompanhar em tempo real a apuração presidencial de 2026 com dados oficiais do TSE.

## Recursos

- **Nacional e por estado:** resultados do 1º e do 2º turno para o Brasil e as 27 UFs.
- **Mapa interativo:** liderança por UF, busca por estado/sigla e filtros rápidos.
- **Modo torcida:** temas **Neutro**, **Lula** e **Flávio Bolsonaro**, salvos no navegador.
- **Métricas completas:** votos e percentuais por candidato, seções apuradas, votos válidos, brancos, nulos, comparecimento e abstenção.
- **Atualização automática:** placar atualizado a cada 15 s e mapa estadual a cada 60 s, com fila e cache para respeitar os limites do TSE.

## Como rodar

Requer **Node.js 20+**, sem dependências externas:

```bash
npm run dev    # servidor local em http://localhost:8765
npm test       # testes automatizados
npm run build  # gera a versão estática em site/
```

## Estrutura

```text
dist/          Aplicação (HTML, CSS, JS e malha GeoJSON do IBGE)
scripts/       Servidor local (dev.mjs) e build estático (build.mjs)
test/          Testes automatizados (node:test)
```

## Fonte dos dados

Os dados são consultados diretamente dos arquivos JSON oficiais do [TSE (formato EA20)](https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados), e a malha geográfica utiliza dados do [IBGE](https://servicodados.ibge.gov.br/api/docs/malhas?versao=3). Projeto independente, sem vínculo com a Justiça Eleitoral.

## Licença

Distribuído sob a licença [MIT](LICENSE).
