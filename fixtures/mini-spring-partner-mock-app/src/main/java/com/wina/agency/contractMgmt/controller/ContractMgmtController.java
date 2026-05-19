package com.wina.agency.contractMgmt.controller;

import com.wina.agency.contractMgmt.service.ContractMgmtService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/agency/contractMgmt")
public class ContractMgmtController {
    @Autowired
    private ContractMgmtService contractMgmtService;

    @GetMapping("/list")
    public Object list() { return contractMgmtService.retrieveContractList(); }

    @GetMapping("/{contractNo}")
    public Object detail() { return contractMgmtService.retrieveContractDetail(); }

    @PostMapping("/save")
    public Object save() { return contractMgmtService.saveContract(); }
}
