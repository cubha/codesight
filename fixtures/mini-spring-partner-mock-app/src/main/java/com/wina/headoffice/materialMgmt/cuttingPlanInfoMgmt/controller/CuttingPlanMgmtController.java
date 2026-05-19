package com.wina.headoffice.materialMgmt.cuttingPlanInfoMgmt.controller;

import com.wina.headoffice.materialMgmt.cuttingPlanInfoMgmt.service.CuttingPlanMgmtService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/headOffice/partner/matMgmt/cuttingPlanMgmt")
public class CuttingPlanMgmtController {
    @Autowired
    private CuttingPlanMgmtService cuttingPlanMgmtService;

    @GetMapping("/moldList")
    public Object moldList() { return cuttingPlanMgmtService.retrieveMoldList(); }

    @GetMapping("/moldNrmList")
    public Object moldNrmList() { return cuttingPlanMgmtService.retrieveMoldNrmList(); }

    @PostMapping("/save")
    public Object save() { return cuttingPlanMgmtService.saveMoldNrm(); }
}
