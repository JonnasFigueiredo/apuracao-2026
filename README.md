# VOTO/2026

Painel responsivo para acompanhar a apuração presidencial brasileira de 2026 no navegador. Os dados vêm dos arquivos JSON oficiais de divulgação do Tribunal Superior Eleitoral (TSE). A página consulta a fonte a cada 15 segundos enquanto está aberta e mostra o horário da parcial divulgado pelo próprio TSE.

## Funcionalidades

- Resultado de presidente no Brasil e em cada uma das 27 unidades federativas, no 1º e no 2º turno.
- Mapa interativo do Brasil, com seleção por estado, lista regional e busca por nome ou sigla.
- Modos de torcida Lula e Flávio Bolsonaro, com temas próprios, destaque do candidato e preferência salva no navegador. O modo neutro fica disponível para voltar ao visual original.
- Votos e percentuais por candidato, seções totalizadas e pendentes, votos válidos, brancos, nulos e comparecimento.
- Indicador de conexão, atualização manual e automática, e link para o arquivo JSON da parcial exibida.
- Layout responsivo e acessível, sem dependências de produção.

## Rodar localmente

É necessário Node.js 20 ou superior.

```bash
npm run dev
```

Abra `http://localhost:8765` no navegador. Para usar outra porta, defina a variável de ambiente `PORT` antes de executar o comando.

## Publicação

O conteúdo de `dist/` é um site estático. Publique essa pasta em qualquer hospedagem de arquivos estáticos. O navegador precisa ter acesso a `https://resultados.tse.jus.br`; o TSE pode alterar regras de disponibilidade, CORS ou a estrutura dos arquivos no futuro.

### GitHub Pages

O workflow `.github/workflows/pages.yml` testa o projeto e publica apenas `dist/` após um push na branch `main`. No repositório, selecione **Settings → Pages → Source → GitHub Actions**. Uma falha nos testes impede a publicação. Os arquivos usam caminhos relativos, compatíveis com sites de projeto como `https://usuario.github.io/apuracao-2026/`.

## Métricas de acesso com GoatCounter

A integração usa o contador [torcida-votacao2026.goatcounter.com](https://torcida-votacao2026.goatcounter.com/). Entre nele com sua conta para acompanhar as métricas. Não há contador fictício ou contagem restrita a um único navegador.

1. Crie uma conta em [goatcounter.com/signup](https://www.goatcounter.com/signup).
2. Em **Account name**, escolha o código do contador. **Site domain** pode ficar em branco até o site estar publicado. Informe seu e-mail, crie sua senha e faça a verificação humana do cadastro.
3. Se seu painel for `https://meu-contador.goatcounter.com`, preencha `siteCode: 'meu-contador'` em `dist/analytics-config.js`.
4. Publique o site e acompanhe as visitas entrando no painel do GoatCounter.

O painel do serviço mostra visitantes estimados, visualizações, origem dos acessos, dispositivos e navegadores. Os eventos do projeto incluem seleção de abrangência e turno, atualização manual e consulta ao arquivo oficial. As consultas automáticas ao TSE não contam como novas visitas. A preferência de torcida permanece local e não é enviada como evento.

O desenvolvimento em localhost e visitantes com Do Not Track ou Global Privacy Control ativados não são medidos. Bloqueadores também podem impedir a medição; portanto, visitantes são uma estimativa. Somente o código público do contador entra no projeto. Senhas e tokens de API nunca devem ser adicionados aos arquivos.

## Verificação

```bash
npm test
```

Os testes cobrem interpretação dos resultados oficiais, nulos técnicos, zerésima, rejeição de dados inconsistentes e as condições que desativam analytics. O visual também foi inspecionado em navegador nos temas neutro e torcida e em larguras de celular e desktop.

## Fonte e atualização

- [Documentação técnica do TSE para 2026](https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados)
- [Arquivo oficial do resultado presidencial do 2º turno](https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json)
- [Arquivo oficial do resultado presidencial do 1º turno](https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json)
- [API de malhas geográficas do IBGE](https://servicodados.ibge.gov.br/api/docs/malhas?versao=3)

Os arquivos são atualizados pelo TSE de acordo com o andamento da totalização, sem uma cadência fixa. A frequência de consulta da região selecionada é de 15 segundos, respeitando o limite publicado pelo TSE. O mapa usa a malha simplificada do IBGE, incluída em `dist/br-ufs.geojson` para carregar mesmo quando a API do IBGE estiver indisponível. Esta aplicação é independente e não representa a Justiça Eleitoral.

## Estrutura

```text
dist/
  index.html      Interface
  styles.css      Estilos responsivos
  themes.css      Temas neutro, Lula e Flávio Bolsonaro
  app.js          Leitura e apresentação dos dados do TSE
  data.js         Interpretação e validação do formato EA20
  analytics.js    Integração com GoatCounter
  analytics-config.js  Código público do contador
  br-ufs.geojson  Malha simplificada dos estados, fonte IBGE
  favicon.svg     Ícone do site
scripts/
  dev.mjs         Servidor local sem dependências
test/
  *.test.mjs      Testes executados com Node.js
```

## Licença

Código disponível para estudo e adaptação. Defina a licença desejada antes de publicar o repositório.
