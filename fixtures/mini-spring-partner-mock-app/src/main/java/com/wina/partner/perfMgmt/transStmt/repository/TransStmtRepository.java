package com.wina.partner.perfMgmt.transStmt.repository;

import org.apache.ibatis.annotations.Mapper;
import java.util.List;
import java.util.Map;

@Mapper
public interface TransStmtRepository {
    List<Map<String, Object>> retrieveTransStmtList();
    List<Map<String, Object>> retrieveTransStmtDetailList();
    List<Map<String, Object>> retrieveTransStmtExcelList();
}
