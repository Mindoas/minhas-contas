# Minhas Contas — controle de gastos da casa

Site para celular (HTML/CSS/JS) com banco de dados no Supabase.

## Estrutura

```
index.html        telas do app
css/style.css     visual
js/config.js      endereço e chave pública do Supabase
js/voz.js         registro por voz (reconhecimento + interpretação da frase)
js/app.js         lógica do app
manifest.json     permite "Adicionar à tela inicial" no celular
icon.svg          ícone
```

## Banco (Supabase — projeto `financas-casa`)

- `categorias`: nome, ícone, cor, tipo (gasto/entrada), ordem, ativa
- `lancamentos`: tipo, valor, categoria, forma de pagamento (pix/dinheiro/debito, só para gastos), observação, foto, data
- Bucket privado `comprovantes` para as fotos das notinhas (pasta por usuário)
- RLS ativado: cada usuário só vê os próprios dados
- Quando um usuário é criado, as categorias padrão aparecem automaticamente

## Primeiro uso (1 vez só)

1. No painel do Supabase → **Authentication → Users → Add user → Create new user**.
   Preencha e-mail e senha e marque **Auto Confirm User**.
2. Publique a pasta (ex.: GitHub Pages, Netlify ou Vercel). Precisa ser **https** para câmera, microfone e PIN funcionarem.
3. No celular, abra o site, entre com o e-mail e a senha e crie a senha de 4 números.
4. Recomendado: no Chrome, menu ⋮ → **Adicionar à tela inicial**.

## Observações

- O registro por voz usa o reconhecimento do próprio navegador: funciona no **Google Chrome** (Android) e precisa de internet.
- A senha de 4 números fica salva só naquele aparelho. "Esqueci minha senha" pede o e-mail e a senha da conta de novo.
- O app bloqueia de novo depois de 5 minutos fora dele.
- Para testar no computador use um servidor local (ex.: `npx serve` ou a extensão Live Server do VS Code), não abra o arquivo direto.
