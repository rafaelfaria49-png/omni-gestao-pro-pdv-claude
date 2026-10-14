# Observação de desenvolvimento

Após a aplicação integral do patch, a suíte V3 teve 18/20 passando e dois testes de replay idêntico falhando na expectativa de botão desabilitado adicionada nesta revisão. O contrato legítimo anterior admite replay canonicamente equivalente; foram restaurados a expectativa de habilitação e o clique principal desses dois casos, mantendo todas as asserções de chave, saldo, baixa e identidade. O teste T08 também prova bloqueio com forma diferente e input profundo idêntico no replay. Não houve skip, fixme ou retry.
