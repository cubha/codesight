package com.wina.partner.contract.service;

import com.wina.partner.contract.repository.ContractRepository;
import org.springframework.stereotype.Service;

@Service
public class ContractService {
    private final ContractRepository repository;
    public ContractService(ContractRepository repository) { this.repository = repository; }
    public String list() { return ""; }
    public String create(String body) { return ""; }
}
