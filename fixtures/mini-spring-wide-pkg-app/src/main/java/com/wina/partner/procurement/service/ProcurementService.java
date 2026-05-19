package com.wina.partner.procurement.service;

import com.wina.partner.procurement.repository.ProcurementRepository;
import org.springframework.stereotype.Service;

@Service
public class ProcurementService {
    private final ProcurementRepository repository;
    public ProcurementService(ProcurementRepository repository) { this.repository = repository; }
    public String list() { return ""; }
    public String create(String body) { return ""; }
}
