package com.wina.partner.ordProdPlanMgmt.prodOrdSpec.service;

import com.wina.partner.ordProdPlanMgmt.prodOrdSpec.repository.ProdOrdSpecRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class ProdOrdSpecServiceImpl implements ProdOrdSpecService {
    @Autowired
    private ProdOrdSpecRepository prodOrdSpecRepository;

    @Override
    public Object retrieveProdOrdSpecList() {
        return prodOrdSpecRepository.retrieveProdOrdSpecList();
    }

    @Override
    public Object retrievePrdoOrderSpecForIdctExcel() {
        return prodOrdSpecRepository.retrievePrdoOrderSpecForIdctExcel();
    }

    @Override
    public Object retrievePrdoLdctList() {
        return prodOrdSpecRepository.retrievePrdoLdctList();
    }
}
