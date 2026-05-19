package com.wina.headoffice.materialMgmt.cuttingPlanInfoMgmt.service;

import com.wina.headoffice.materialMgmt.cuttingPlanInfoMgmt.repository.CuttingPlanMgmtRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class CuttingPlanMgmtServiceImpl implements CuttingPlanMgmtService {
    @Autowired
    private CuttingPlanMgmtRepository cuttingPlanMgmtRepository;

    @Override
    public Object retrieveMoldList() { return cuttingPlanMgmtRepository.retrieveMoldList(); }

    @Override
    public Object retrieveMoldNrmList() { return cuttingPlanMgmtRepository.retrieveMoldNrmList(); }

    @Override
    public Object saveMoldNrm() { return cuttingPlanMgmtRepository.insertMoldNrm(); }
}
