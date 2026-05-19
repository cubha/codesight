package com.wina.partner.ordProdPlanMgmt.prodOrdSpec.controller;

import com.wina.partner.ordProdPlanMgmt.prodOrdSpec.service.ProdOrdSpecService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/partner/ordProdPlanMgmt/prodOrdSpec")
public class ProdOrdSpecController {
    @Autowired
    private ProdOrdSpecService prodOrdSpecService;

    @GetMapping("/list")
    public Object retrieveList() {
        return prodOrdSpecService.retrieveProdOrdSpecList();
    }

    @GetMapping("/production-instruction")
    public Object productionInstruction() {
        return prodOrdSpecService.retrievePrdoOrderSpecForIdctExcel();
    }

    @GetMapping("/handle-info")
    public Object handleInfo() {
        return prodOrdSpecService.retrievePrdoLdctList();
    }
}
