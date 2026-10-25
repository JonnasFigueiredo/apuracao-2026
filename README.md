# VOTO/2026

[Abrir painel ao vivo](https://jonnasfigueiredo.github.io/apuracao-2026/)

Painel responsivo para acompanhar a apuração presidencial brasileira de 2026 no navegador. Os dados vêm dos arquivos JSON oficiais de divulgação do Tribunal Superior Eleitoral (TSE). A página consulta a fonte a cada 15 segundos enquanto está aberta e mostra o horário da parcial divulgado pelo próprio TSE.

## Funcionalidades

- Resultado de presidente no Brasil e em cada uma das 27 unidades federativas, no 1º e no 2º turno.
- Mapa de lideranças nas 27 UFs, com cores por candidato, legenda, informações ao passar o mouse ou usar o teclado, lista regional e busca.
- Modos de torcida Lula e Flávio Bolsonaro, com temas próprios, destaque do candidato e preferência salva no navegador. O modo neutro fica disponível para voltar ao visual original.
- Resumo das UFs em que a torcida lidera, com filtro no mapa e na lista. Empate, zerésima, erro e parcial anterior recebem identificação própria.
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

Execute `npm run build` e publique a pasta gerada `site/` em uma hospedagem estática. O build inclui uma versão nas URLs dos estilos e módulos para evitar misturar arquivos de publicações diferentes. O navegador precisa ter acesso a `https://resultados.tse.jus.br`.

### GitHub Pages

O workflow `.github/workflows/pages.yml` testa o projeto, gera `site/` e publica essa pasta após um push na branch `main`. No repositório, selecione **Settings → Pages → Source → GitHub Actions**. Uma falha nos testes impede a publicação. Os caminhos relativos são compatíveis com sites como `https://usuario.github.io/apuracao-2026/`.

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

Os testes cobrem interpretação dos resultados oficiais, nulos técnicos, zerésima, empates, resumo de lideranças, rejeição de dados inconsistentes, fila de consultas, pausa após limitação do TSE e as condições que desativam analytics. O visual também foi inspecionado em navegador nos temas neutro e torcida e em larguras de celular e desktop.

## Fonte e atualização

- [Documentação técnica do TSE para 2026](https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados)
- [Arquivo oficial do resultado presidencial do 2º turno](https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json)
- [Arquivo oficial do resultado presidencial do 1º turno](https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json)
- [API de malhas geográficas do IBGE](https://servicodados.ibge.gov.br/api/docs/malhas?versao=3)

Os arquivos são atualizados pelo TSE de acordo com o andamento da totalização, sem uma cadência fixa. A seleção é consultada a cada 15 segundos, e as 27 UFs a cada 60 segundos. A fila compartilha as consultas entre placar e mapa, reutiliza respostas recentes e espaça acessos em pelo menos 300 ms. Em respostas HTTP 403 ou 429, o cliente pausa as consultas por pelo menos dez minutos. Três erros estaduais seguidos interrompem o ciclo corrente. A troca de turno cancela o ciclo anterior.

As cores indicam quem lidera pelos votos nominais da parcial, sem projeções de vencedor. Percentuais arredondados iguais não são tratados como empate se os votos forem diferentes. Cada UF pode ter um horário de totalização distinto. Se uma consulta falhar, uma parcial anterior continua identificada como tal.

O mapa usa a malha simplificada do IBGE, incluída em `dist/br-ufs.geojson`. Esta aplicação é independente e não representa a Justiça Eleitoral.

## Estrutura

```text
dist/
  index.html      Interface
  styles.css      Estilos responsivos
  themes.css      Temas neutro, Lula e Flávio Bolsonaro
  app.js          Leitura e apresentação dos dados do TSE
  data.js         Interpretação e validação do formato EA20
  states.js       UFs e regras de liderança na parcial
  tse-client.js   Fila, cache, cancelamento e limites de consulta
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
